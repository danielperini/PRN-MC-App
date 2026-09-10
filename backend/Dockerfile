FROM node:22-alpine

WORKDIR /app

RUN npm init -y && npm install express pg multer socket.io bcryptjs xlsx nodemailer googleapis

COPY server.mjs ./
COPY auth-bootstrap.mjs ./
COPY programacao-sync.mjs ./
COPY drive-reconcile-intake.mjs ./
COPY drive-reconcile-sequence.mjs ./

EXPOSE 3000

CMD ["node", "--import", "./programacao-sync.mjs", "--import", "./auth-bootstrap.mjs", "server.mjs"]
