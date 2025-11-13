using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace eln.Backend.Application.Auth
{
    public class LdapSettings
    {
        public string Server { get; set; } = "";
        public int Port { get; set; } = 389;
        public bool UseSsl { get; set; } = false;
        public string BaseDn { get; set; } = "";
        public string UserAttribute { get; set; } = "uid";

        //Falls technischer Service-User 
        public string? ServiceUserDn { get; set; }
        public string? ServiceUserPassword { get; set; }
    }
}
