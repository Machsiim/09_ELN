using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace eln.Backend.Application.Auth
{
    public class JwtSettings
    {
        public string Secret { get; set; } = "";
        public string Issuer { get; set; } = "";
        public string Audience { get; set; } = "";
        public int ExpirationInMinutes { get; set; } = 60;
    }
}
