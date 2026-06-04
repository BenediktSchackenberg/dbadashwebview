using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

namespace DBADashWebView.Auth;

public sealed class JwtTokenService(JwtOptions options, SymmetricSecurityKey signingKey)
{
    public string CreateToken(
        string username,
        string? displayName,
        string role,
        IEnumerable<string>? allowedTags = null,
        IEnumerable<int>? allowedGroupIds = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, username),
            new(ClaimTypes.Role, role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (!string.IsNullOrWhiteSpace(displayName))
        {
            claims.Add(new Claim("displayName", displayName));
        }

        if (allowedTags is not null)
        {
            foreach (var tag in allowedTags)
            {
                if (!string.IsNullOrWhiteSpace(tag))
                {
                    claims.Add(new Claim(AppClaimTypes.AllowedTag, tag.Trim()));
                }
            }
        }

        if (allowedGroupIds is not null)
        {
            foreach (var id in allowedGroupIds)
            {
                claims.Add(new Claim(AppClaimTypes.AllowedGroupId, id.ToString()));
            }
        }

        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            options.Issuer,
            options.Audience,
            claims,
            expires: DateTime.UtcNow.AddHours(options.ExpirationHours),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public static class AppClaimTypes
{
    public const string AllowedTag = "scope_tag";
    public const string AllowedGroupId = "scope_group";
}
