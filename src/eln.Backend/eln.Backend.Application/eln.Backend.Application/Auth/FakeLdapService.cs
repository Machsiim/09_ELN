using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace eln.Backend.Application.Auth
{
    public class FakeLdapService : ILdapService
    {
        public bool ValidateUser(string username, string password)
        {
            if (username == "admin" && password == "admin123")
                return true;

            return false;
        }
    }
}
