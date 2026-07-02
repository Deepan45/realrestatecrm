pipeline {
    agent any

    environment {
        IMAGE_BACKEND  = "realrestatecrm-backend"
        IMAGE_FRONTEND = "realrestatecrm-frontend"

        CONTAINER_BACKEND  = "realrestatecrm-backend-app"
        CONTAINER_FRONTEND = "realrestatecrm-frontend-app"
        POSTGRES_CONTAINER = "postgres"
        CRM_NETWORK        = "realcrm-net"

        APP_PORT_API  = "5300"
        APP_PORT_HTTP = "4400"

        DATABASE_URL = "postgresql://postgres:Deepakiucs%402025@postgres:5432/realcrm"
        JWT_SECRET     = "realcrm_jwt_secret_change_in_production_2026"
        JWT_EXPIRES_IN = "7d"

        // App (non-secret)
        NODE_ENV            = "production"
        APP_URL             = "https://realcrm.meettomanage.cloud"
        NEXT_PUBLIC_API_URL = "https://apirealcrm.meettomanage.cloud/api"

        // WhatsApp: "mock" logs messages locally, "cloud" uses WhatsApp Cloud API
        WHATSAPP_PROVIDER        = "mock"
        WHATSAPP_CLOUD_API_URL   = "https://graph.facebook.com/v19.0"
        WHATSAPP_PHONE_NUMBER_ID = ""
        WHATSAPP_ACCESS_TOKEN    = ""

        // Email (leave SMTP_HOST empty to log emails to console)
        SMTP_HOST = ""
        SMTP_PORT = "587"
        SMTP_USER = ""
        SMTP_PASS = ""
        MAIL_FROM = "RealRest CRM <noreply@realrest.example>"
    }

    stages {

        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/DeepakVijayasarathi/realrestatecrm.git',
                    credentialsId: 'github'
            }
        }

        stage('Build Backend Image') {
            steps {
                sh "docker build -t ${IMAGE_BACKEND}:${BUILD_NUMBER} -t ${IMAGE_BACKEND}:latest ./backend"
            }
        }

        stage('Build Frontend Image') {
            steps {
                sh """
                    docker build \\
                        --build-arg NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \\
                        -t ${IMAGE_FRONTEND}:${BUILD_NUMBER} \\
                        -t ${IMAGE_FRONTEND}:latest \\
                        ./frontend
                """
            }
        }

        stage('Stop Old Containers') {
            steps {
                sh """
                    docker stop ${CONTAINER_BACKEND} ${CONTAINER_FRONTEND} 2>/dev/null || true
                    docker rm   ${CONTAINER_BACKEND} ${CONTAINER_FRONTEND} 2>/dev/null || true
                    docker ps -q --filter publish=${APP_PORT_API}  | xargs -r docker stop 2>/dev/null || true
                    docker ps -q --filter publish=${APP_PORT_API}  | xargs -r docker rm   2>/dev/null || true
                    docker ps -q --filter publish=${APP_PORT_HTTP} | xargs -r docker stop 2>/dev/null || true
                    docker ps -q --filter publish=${APP_PORT_HTTP} | xargs -r docker rm   2>/dev/null || true
                    sleep 2
                """
            }
        }

        stage('Deploy') {
            steps {
                sh """
                    docker volume create realcrm-uploads || true
                    docker network create ${CRM_NETWORK} 2>/dev/null || true
                    docker network connect ${CRM_NETWORK} ${POSTGRES_CONTAINER} 2>/dev/null || true

                    docker run --rm \\
                        --network ${CRM_NETWORK} \\
                        -e DATABASE_URL="${DATABASE_URL}" \\
                        ${IMAGE_BACKEND}:${BUILD_NUMBER} \\
                        npx prisma migrate deploy

                    docker run -d \\
                        --name ${CONTAINER_BACKEND} \\
                        --restart unless-stopped \\
                        --network ${CRM_NETWORK} \\
                        --add-host=host.docker.internal:host-gateway \\
                        -e NODE_ENV=${NODE_ENV} \\
                        -e DATABASE_URL="${DATABASE_URL}" \\
                        -e APP_URL=${APP_URL} \\
                        -e JWT_SECRET=${JWT_SECRET} \\
                        -e JWT_EXPIRES_IN=${JWT_EXPIRES_IN} \\
                        -e WHATSAPP_PROVIDER=${WHATSAPP_PROVIDER} \\
                        -e WHATSAPP_CLOUD_API_URL=${WHATSAPP_CLOUD_API_URL} \\
                        -e WHATSAPP_PHONE_NUMBER_ID="${WHATSAPP_PHONE_NUMBER_ID}" \\
                        -e WHATSAPP_ACCESS_TOKEN="${WHATSAPP_ACCESS_TOKEN}" \\
                        -e SMTP_HOST="${SMTP_HOST}" \\
                        -e SMTP_PORT="${SMTP_PORT}" \\
                        -e SMTP_USER="${SMTP_USER}" \\
                        -e SMTP_PASS="${SMTP_PASS}" \\
                        -e MAIL_FROM="${MAIL_FROM}" \\
                        -e PORT=4000 \\
                        -p ${APP_PORT_API}:4000 \\
                        -v realcrm-uploads:/app/uploads \\
                        --health-cmd 'wget -qO- http://localhost:4000/api/health || exit 1' \\
                        --health-interval 15s \\
                        --health-timeout 5s \\
                        --health-retries 5 \\
                        --health-start-period 20s \\
                        ${IMAGE_BACKEND}:${BUILD_NUMBER}

                    echo "Waiting for backend to become healthy..."
                    HEALTHY=0
                    for i in \$(seq 1 20); do
                        STATUS=\$(docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_BACKEND} 2>/dev/null)
                        if [ "\$STATUS" = "healthy" ]; then
                            echo "Backend is healthy after \$i checks"
                            HEALTHY=1
                            break
                        fi
                        echo "  attempt \$i/20: \$STATUS"
                        sleep 5
                    done
                    if [ "\$HEALTHY" = "0" ]; then
                        echo "Backend did not become healthy — last logs:"
                        docker logs --tail=50 ${CONTAINER_BACKEND} 2>&1 || true
                    fi

                    docker run -d \\
                        --name ${CONTAINER_FRONTEND} \\
                        --restart unless-stopped \\
                        --network ${CRM_NETWORK} \\
                        -e NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \\
                        -e PORT=3000 \\
                        -p ${APP_PORT_HTTP}:3000 \\
                        --health-cmd 'wget -qO- http://localhost:3000 || exit 1' \\
                        --health-interval 30s \\
                        --health-timeout 10s \\
                        --health-retries 3 \\
                        ${IMAGE_FRONTEND}:${BUILD_NUMBER}
                """
            }
        }

        stage('Prune Old Images') {
            steps {
                sh """
                    docker images ${IMAGE_BACKEND} --format '{{.Tag}}' | \\
                        grep -v latest | grep -v ${BUILD_NUMBER} | \\
                        xargs -r -I{} docker rmi ${IMAGE_BACKEND}:{} || true

                    docker images ${IMAGE_FRONTEND} --format '{{.Tag}}' | \\
                        grep -v latest | grep -v ${BUILD_NUMBER} | \\
                        xargs -r -I{} docker rmi ${IMAGE_FRONTEND}:{} || true
                """
            }
        }
    }

    post {
        success {
            echo "Deployment successful — build #${BUILD_NUMBER}"
            echo "Backend  → ${APP_URL}/api/health"
            echo "Frontend → ${APP_URL}"
        }

        failure {
            echo "Build #${BUILD_NUMBER} FAILED — rolling back"
            sh """
                docker stop ${CONTAINER_BACKEND} ${CONTAINER_FRONTEND} 2>/dev/null || true
                docker rm   ${CONTAINER_BACKEND} ${CONTAINER_FRONTEND} 2>/dev/null || true
                docker ps -q --filter publish=${APP_PORT_API}  | xargs -r docker stop 2>/dev/null || true
                docker ps -q --filter publish=${APP_PORT_API}  | xargs -r docker rm   2>/dev/null || true
                docker ps -q --filter publish=${APP_PORT_HTTP} | xargs -r docker stop 2>/dev/null || true
                docker ps -q --filter publish=${APP_PORT_HTTP} | xargs -r docker rm   2>/dev/null || true
                sleep 2

                docker network create ${CRM_NETWORK} 2>/dev/null || true
                docker network connect ${CRM_NETWORK} ${POSTGRES_CONTAINER} 2>/dev/null || true

                PREV=\$(expr ${BUILD_NUMBER} - 1)
                if [ "\$PREV" -gt 0 ]; then
                    if docker image inspect ${IMAGE_BACKEND}:\$PREV > /dev/null 2>&1; then
                        docker run -d \\
                            --name ${CONTAINER_BACKEND} \\
                            --restart unless-stopped \\
                            --network ${CRM_NETWORK} \\
                            --add-host=host.docker.internal:host-gateway \\
                            -e NODE_ENV=production \\
                            -e DATABASE_URL="${DATABASE_URL}" \\
                            -e APP_URL=${APP_URL} \\
                            -e JWT_SECRET=${JWT_SECRET} \\
                            -e JWT_EXPIRES_IN=${JWT_EXPIRES_IN} \\
                            -e WHATSAPP_PROVIDER=${WHATSAPP_PROVIDER} \\
                            -e WHATSAPP_CLOUD_API_URL=${WHATSAPP_CLOUD_API_URL} \\
                            -e WHATSAPP_PHONE_NUMBER_ID="${WHATSAPP_PHONE_NUMBER_ID}" \\
                            -e WHATSAPP_ACCESS_TOKEN="${WHATSAPP_ACCESS_TOKEN}" \\
                            -e SMTP_HOST="${SMTP_HOST}" \\
                            -e SMTP_PORT="${SMTP_PORT}" \\
                            -e SMTP_USER="${SMTP_USER}" \\
                            -e SMTP_PASS="${SMTP_PASS}" \\
                            -e MAIL_FROM="${MAIL_FROM}" \\
                            -e PORT=4000 \\
                            -p ${APP_PORT_API}:4000 \\
                            -v realcrm-uploads:/app/uploads \\
                            ${IMAGE_BACKEND}:\$PREV
                        echo "Rolled back backend to build \$PREV"
                    else
                        echo "No previous backend image — skipping rollback"
                    fi
                    if docker image inspect ${IMAGE_FRONTEND}:\$PREV > /dev/null 2>&1; then
                        docker run -d \\
                            --name ${CONTAINER_FRONTEND} \\
                            --restart unless-stopped \\
                            --network ${CRM_NETWORK} \\
                            -e NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \\
                            -e PORT=3000 \\
                            -p ${APP_PORT_HTTP}:3000 \\
                            ${IMAGE_FRONTEND}:\$PREV
                        echo "Rolled back frontend to build \$PREV"
                    else
                        echo "No previous frontend image — skipping rollback"
                    fi
                else
                    echo "Build #1 failed — nothing to roll back to"
                fi
            """
        }
    }
}
