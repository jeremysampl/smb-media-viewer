# syntax=docker/dockerfile:1
# Requires additional build context `backend` (repo backend/) so @smb/file-types resolves.
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# Path aliases expect ../backend/src/media/fileTypes.ts from /app
COPY --from=backend src/media/fileTypes.ts /backend/src/media/fileTypes.ts
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
