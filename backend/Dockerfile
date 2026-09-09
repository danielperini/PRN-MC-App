FROM node:22-alpine

WORKDIR /app

RUN npm init -y && npm install express pg multer socket.io bcryptjs google-auth-library googleapis nodemailer

COPY server.mjs ./
COPY purchase-production-routes.mjs ./
COPY google-drive-backup.mjs ./
COPY auth-bootstrap.mjs ./
COPY daily-approved-purchases.mjs ./

EXPOSE 3000

CMD ["node", "--import", "./auth-bootstrap.mjs", "server.mjs"]
