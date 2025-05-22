# Build and run fullstack Battleship app

# 1. Build frontend
FROM node:22 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install @microsoft/signalr # Ensure SignalR client is installed
RUN npm ci
COPY frontend/ .
RUN npm run build

# 2. Build backend
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS backend-build
WORKDIR /app
COPY backend/*.csproj ./backend/
RUN dotnet restore ./backend/backend.csproj
COPY backend/. ./backend/
COPY --from=frontend-build /app/frontend/dist ./backend/wwwroot
RUN dotnet publish ./backend/backend.csproj -c Release -o ./backend/out

# 3. Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/backend/out .
EXPOSE 5000
ENV VITE_SIGNALR_URL="https://xebia.conti.foo"
ENTRYPOINT ["dotnet", "backend.dll"]
