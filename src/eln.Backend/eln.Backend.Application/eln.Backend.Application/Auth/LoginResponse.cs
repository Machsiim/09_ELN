using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace eln.Backend.Application.Auth
{
    public class LoginResponse
    {
        public string Token { get; set; } = "";
        public DateTime ExpiresAt { get; set; }
    }
}
