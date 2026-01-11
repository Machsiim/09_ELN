# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution file
COPY eln.Backend.sln ./

# Copy project files
COPY eln.Backend.Application/eln.Backend.Application/*.csproj ./eln.Backend.Application/eln.Backend.Application/
COPY eln.Backend.Webapi/eln.Backend.Webapi/*.csproj ./eln.Backend.Webapi/eln.Backend.Webapi/
COPY eln.Backend.Tests/*.csproj ./eln.Backend.Tests/

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

# Install LDAP client libraries required for System.DirectoryServices.Protocols
RUN apt-get update && \
    apt-get install -y libldap-2.5-0 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "eln.Backend.Webapi.dll"]
