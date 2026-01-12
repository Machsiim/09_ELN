using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace eln.Backend.Application.Auth
{
    public class LdapSettings
    {
        public string Server { get; set; } = string.Empty;
        public int Port { get; set; } = 636;
        public bool UseSsl { get; set; } = true;

        public string BaseDn { get; set; } = string.Empty;
        public string UserAttribute { get; set; } = "uid";

        /// <summary>
        /// Validate SSL certificate. Should be true in production, can be false for development.
        /// </summary>
        public bool ValidateCertificate { get; set; } = true;
    }
}
