const { signup } = require('../src/validation/user');

test('rejects a password over the bcrypt byte limit', () => {
  const result = signup.validate({
    email: 'student@example.com', name: 'Student', password: 'я'.repeat(37),
  });
  expect(result.error.message).toMatch(/72 bytes/);
});
