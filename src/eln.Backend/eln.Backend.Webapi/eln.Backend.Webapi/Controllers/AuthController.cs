using eln.Backend.Application.Auth;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
namespace eln.Backend.Webapi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ILdapService _ldapService;
        private readonly JwtSettings _jwtSettings;
        private readonly ElnContext _context;
        private readonly IHostEnvironment _environment;

        public AuthController(ILdapService ldapService, IOptions<JwtSettings> jwtOptions, ElnContext context, IHostEnvironment environment)
        {
            _ldapService = ldapService;
            _jwtSettings = jwtOptions.Value;
            _context = context;
            _environment = environment;
        }

        [HttpPost("login")]
        public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
        {
            // Development-only: Allow local admin user (admin/11111111)
            var isDevAdmin = _environment.IsDevelopment()
                && request.Username == "admin"
                && request.Password == "11111111";

            if (!isDevAdmin && !_ldapService.ValidateUser(request.Username, request.Password))
                return Unauthorized();
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == request.Username);
            if (user == null)
            {
                user = new User(request.Username, GetRoleFromUsername(request.Username));

                _context.Users.Add(user);
                await _context.SaveChangesAsync();
            }

            var token = GenerateJwtToken(request.Username, out var expiresAt);

            return Ok(new LoginResponse { Token = token, ExpiresAt = expiresAt });
        }

        [HttpGet("GetUser")]
        [Authorize] // nur mit gültigem JWT erreichbar
        public async Task<ActionResult<UserDto>> GetUser()
        {
            // Username aus dem JWT holen
            var username = User.FindFirst(ClaimTypes.Name)?.Value;

            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // User aus der DB laden
            var user = await _context.Users
                .SingleOrDefaultAsync(u => u.Username == username);

            if (user == null)
                return NotFound();

            // Antwort zusammenbauen
            var response = new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Role = user.Role ?? "User"
            };

            return Ok(response);
        }


        private string GenerateJwtToken(string username, out DateTime expiresAt)
        {
            // Rolle aus dem Usernamen ableiten:
            var role = username.StartsWith("if", StringComparison.OrdinalIgnoreCase)
                ? "Student"
                : "Staff";

            return GenerateJwtToken(username, role, out expiresAt);
        }

        private string GenerateJwtToken(string username, string role, out DateTime expiresAt)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Secret));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.Name, username),
                new Claim(ClaimTypes.Role, role)
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

        private string GetRoleFromUsername(string username)
        {
            if (string.IsNullOrWhiteSpace(username))
                return "User";

            // Wenn eine Mail kommt, nur den Teil vor dem @ betrachten
            var localPart = username.Split('@')[0];

            // Mitarbeiter: nur Buchstaben + ein Punkt, keine Ziffern
            var isStudent = Regex.IsMatch(localPart, @"^[a-z]{2}[0-9]{2}[a-z][0-9]{3}$");

            return isStudent ? "Student" : "Staff";
        }
    }
}
