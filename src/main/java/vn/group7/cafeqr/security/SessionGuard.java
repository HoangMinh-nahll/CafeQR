package vn.group7.cafeqr.security;

import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;

public final class SessionGuard {
    private SessionGuard() {}

    public static long requireRole(HttpSession session, String... allowedRoles) {
        if (session == null || session.getAttribute("userId") == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập.");
        }
        String role = String.valueOf(session.getAttribute("role"));
        if (!Arrays.asList(allowedRoles).contains(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền thực hiện chức năng này.");
        }
        return ((Number) session.getAttribute("userId")).longValue();
    }
}
