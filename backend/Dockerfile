FROM node:22-alpine

WORKDIR /app

RUN npm init -y && npm install express pg multer socket.io

COPY server.mjs ./

EXPOSE 3000

CMD ["node", "server.mjs"]
