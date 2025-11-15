using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace eln.Backend.Application.Auth
{
    public interface ILdapService
    {
        bool ValidateUser(string username, string password);
    }
}
