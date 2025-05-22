# Build and run fullstack Battleship app

# 1. Build frontend
FROM node:20 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
# Install SignalR client for React
RUN npm install
COPY frontend/ .
RUN npm run build

# 2. Build backend
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS backend-build
WORKDIR /app
COPY backend/*.csproj ./backend/
RUN dotnet restore ./backend/backend.csproj
COPY backend/. ./backend/
COPY --from=frontend-build /app/frontend/dist ./backend/wwwroot
RUN dotnet publish ./backend/backend.csproj -c Release -o out

# 3. Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/backend/out .
ENTRYPOINT ["dotnet", "backend.dll"]
