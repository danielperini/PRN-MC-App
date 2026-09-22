FROM node:22-alpine

WORKDIR /app

RUN npm init -y && npm install express pg multer socket.io bcryptjs xlsx nodemailer googleapis

COPY server.mjs ./
COPY auth-bootstrap.mjs ./
COPY programacao-sync.mjs ./
COPY drive-reconcile-intake.mjs ./
COPY drive-reconcile-sequence.mjs ./
COPY reconcile-invoices-purchases.mjs ./
COPY reconcile-noturno-payments-2026.mjs ./
COPY reconcile-noturno-classification-2026.mjs ./
COPY drive-reconcile-current-month.mjs ./
COPY drive-daily-watchdog.mjs ./
COPY backup-pending-drive.mjs ./
COPY sync-report-gallery.mjs ./
COPY audit-drive-purchase-links.mjs ./
COPY monthly-report-reminders.mjs ./
COPY send-professional-access-check.mjs ./

EXPOSE 3000

CMD ["node", "--import", "./programacao-sync.mjs", "--import", "./auth-bootstrap.mjs", "--import", "./monthly-report-reminders.mjs", "server.mjs"]
