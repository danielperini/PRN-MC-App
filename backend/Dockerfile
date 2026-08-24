FROM node:22-alpine

WORKDIR /app

RUN npm init -y && npm install express pg multer socket.io bcryptjs google-auth-library

COPY server.mjs ./
COPY auth-bootstrap.mjs ./

EXPOSE 3000

CMD ["node", "--import", "./auth-bootstrap.mjs", "server.mjs"]
