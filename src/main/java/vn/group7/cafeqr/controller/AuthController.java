package vn.group7.cafeqr.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public AuthController(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        Map<String, Object> user;
        try {
            user = jdbc.queryForMap(
                    "SELECT user_id, username, full_name, password_hash, role, is_active FROM users WHERE username = ?",
                    request.username().trim());
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu không đúng.");
        }

        if (!Boolean.TRUE.equals(user.get("is_active"))
                || !passwordEncoder.matches(request.password(), (String) user.get("password_hash"))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tên đăng nhập hoặc mật khẩu không đúng.");
        }

        HttpSession old = servletRequest.getSession(false);
        if (old != null) old.invalidate();
        HttpSession session = servletRequest.getSession(true);
        session.setAttribute("userId", ((Number) user.get("user_id")).longValue());
        session.setAttribute("username", user.get("username"));
        session.setAttribute("fullName", user.get("full_name"));
        session.setAttribute("role", user.get("role"));

        return Map.of(
                "success", true,
                "username", user.get("username"),
                "fullName", user.get("full_name"),
                "role", user.get("role"),
                "message", "Đăng nhập thành công.");
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpSession session) {
        if (session == null || session.getAttribute("userId") == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Bạn chưa đăng nhập.");
        }
        return Map.of(
                "userId", session.getAttribute("userId"),
                "username", session.getAttribute("username"),
                "fullName", session.getAttribute("fullName"),
                "role", session.getAttribute("role"));
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        return Map.of("success", true, "message", "Đã đăng xuất.");
    }
}
