using System.DirectoryServices.Protocols;
using System.Net;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace eln.Backend.Application.Auth;


public class LdapService : ILdapService
{
    private readonly LdapSettings _settings;
    private readonly ILogger<LdapService> _logger;

    
    public LdapService(IOptions<LdapSettings> settings, ILogger<LdapService> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    // Prüft Benutzername und Passwort, indem ein LDAP-Bind mit dem FH-LDAP-Server gemacht wird.
    public bool ValidateUser(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return false;

        try
        {
            var identifier = new LdapDirectoryIdentifier(
                _settings.Server,
                _settings.Port,
                false,
                false);

            using var connection = new LdapConnection(identifier)
            {
                AuthType = AuthType.Basic
            };

            
            connection.SessionOptions.ProtocolVersion = 3;

            // Baut den vollständigen Distinguished Name (DN) des Benutzers zusammen.
            var userDn = $"{_settings.UserAttribute}={username},{_settings.BaseDn}";

            _logger.LogInformation(
                "Trying LDAP bind for DN '{UserDn}' on {Server}:{Port} (SSL={UseSsl})",
                userDn, _settings.Server, _settings.Port, _settings.UseSsl);

            // Setzt Anmeldedaten für den LDAP-Bind.
            connection.Credential = new NetworkCredential(userDn, password);

            if (_settings.UseSsl)
            {
                // Aktiviert SSL/TLS für die Verbindung.
                connection.SessionOptions.SecureSocketLayer = true;
                
                connection.SessionOptions.VerifyServerCertificate += (conn, cert) => true;
            }

            
            connection.Bind();

            _logger.LogInformation("LDAP bind successful for DN '{UserDn}'", userDn);
            return true;
        }
        catch (LdapException ex) 
        {
            _logger.LogError(ex,
               "LDAP error (Code {Code}): {Message}",
               ex.ErrorCode,
               ex.Message);
            return false;
        }
       
    }
}
