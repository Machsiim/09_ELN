using Microsoft.Extensions.Options;
using Novell.Directory.Ldap;
using System.Data;

namespace eln.Backend.Application.Auth;

public class LdapService : ILdapService
{
    private readonly LdapSettings _settings;

    public LdapService(IOptions<LdapSettings> settings)
    {
        _settings = settings.Value;
    }

    public bool ValidateUser(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return false;

        try
        {
            using var connection = new LdapConnection();

            connection.Connect(_settings.Server, _settings.Port);

            if (_settings.UseSsl)
            {
                connection.SecureSocketLayer = true;
            }

            // DN direkt aus Username bauen
            var userDn = $"{_settings.UserAttribute}={username},{_settings.BaseDn}";

            connection.Bind(userDn, password);

            return connection.Bound;
        }
        catch (Exception ex) 
        {
           
            throw new Exception("Fehler bei der LDAP-Authentifizierung",ex);
           
        }
    }
}
