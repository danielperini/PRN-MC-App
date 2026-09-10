FROM node:22-alpine

WORKDIR /app

RUN npm init -y && npm install express pg multer socket.io bcryptjs google-auth-library googleapis nodemailer xlsx

COPY server.mjs ./
COPY programacao-sync.mjs ./
COPY purchase-production-routes.mjs ./
COPY google-drive-backup.mjs ./
COPY auth-bootstrap.mjs ./
COPY daily-approved-purchases.mjs ./

COPY drive-reconcile-intake.mjs ./
EXPOSE 3000

CMD ["node", "--import", "./auth-bootstrap.mjs", "--import", "./programacao-sync.mjs", "server.mjs"]