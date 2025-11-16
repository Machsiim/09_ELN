# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution file
COPY eln.Backend.sln ./

# Copy project files
COPY eln.Backend.Application/eln.Backend.Application/*.csproj ./eln.Backend.Application/eln.Backend.Application/
COPY eln.Backend.Webapi/eln.Backend.Webapi/*.csproj ./eln.Backend.Webapi/eln.Backend.Webapi/

# Restore dependencies
RUN dotnet restore

# Copy everything else
COPY . .

# Build the application
WORKDIR /src/eln.Backend.Webapi/eln.Backend.Webapi
RUN dotnet build -c Release -o /app/build

# Publish stage
FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "eln.Backend.Webapi.dll"]
