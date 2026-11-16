document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const message = document.getElementById('loginMessage');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'Đang đăng nhập...';
    message.className = 'form-message';
    try {
      const result = await CafeApp.api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('username').value.trim(),
          password: document.getElementById('password').value
        })
      });
      window.location.href = result.role === 'MANAGER' ? '/admin.html' : '/staff.html';
    } catch (error) {
      message.textContent = error.message;
      message.classList.add('error-message');
    }
  });
});
