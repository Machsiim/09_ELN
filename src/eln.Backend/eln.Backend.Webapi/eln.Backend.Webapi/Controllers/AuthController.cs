using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using eln.Backend.Application.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
namespace eln.Backend.Webapi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ILdapService _ldapService;
        private readonly JwtSettings _jwtSettings;

        public AuthController(ILdapService ldapService, IOptions<JwtSettings> jwtOptions)
        {
            _ldapService = ldapService;
            _jwtSettings = jwtOptions.Value;
        }

        [HttpPost("login")]
        public ActionResult<LoginResponse> Login([FromBody] LoginRequest request)
        {
            if (!_ldapService.ValidateUser(request.Username, request.Password))
                return Unauthorized();

            var token = GenerateJwtToken(request.Username, out var expiresAt);

            return Ok(new LoginResponse { Token = token, ExpiresAt = expiresAt });
        }

        private string GenerateJwtToken(string username, out DateTime expiresAt)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Secret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
            new Claim(ClaimTypes.Name, username)
        };

            expiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpirationInMinutes);

            var token = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                expires: expiresAt,
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
