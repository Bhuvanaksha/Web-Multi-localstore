import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshTokenModel } from '../../src/models/RefreshTokenModel.js';
import { UserModel } from '../../src/models/UserModel.js';
import { AuthService } from '../../src/services/AuthService.js';
import { sendMail } from '../../src/utils/email.js';
import { AuthenticationError, ConflictError } from '../../src/utils/errors.js';

vi.mock('../../src/models/UserModel.js', () => ({
  UserModel: {
    exists: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByCredentials: vi.fn(),
    findOne: vi.fn(),
  },
}));

vi.mock('../../src/models/RefreshTokenModel.js', () => ({
  RefreshTokenModel: {
    create: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../../src/utils/email.js', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

const mockUser = {
  _id: '507f1f77bcf86cd799439011',
  email: 'ada@example.com',
  username: 'ada_lovelace',
  password: 'hashed-password-123456',
  role: 'customer',
  profile: undefined,
  isActive: true,
  emailVerified: false,
  mfaEnabled: false,
  createdAt: new Date('2024-01-01'),
  comparePassword: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.clearAllMocks();
  (UserModel.exists as ReturnType<typeof vi.fn>).mockReset();
  (UserModel.create as ReturnType<typeof vi.fn>).mockReset();
  (RefreshTokenModel.create as ReturnType<typeof vi.fn>).mockReset();
});

describe('AuthService.register', () => {
  const input = {
    email: 'Ada@Example.com',
    username: 'ada_lovelace',
    password: 'super-secret-password-123',
  };

  it('creates a user with normalized email and returns it without the password', async () => {
    (UserModel.exists as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (UserModel.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const user = await AuthService.register(input);

    expect(UserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', role: 'customer' }),
    );
    expect(user.email).toBe('ada@example.com');
    expect(user).not.toHaveProperty('password');
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it('rejects duplicate emails with ConflictError', async () => {
    (UserModel.exists as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(AuthService.register(input)).rejects.toThrow(ConflictError);
    expect(UserModel.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate usernames with ConflictError', async () => {
    (UserModel.exists as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(AuthService.register(input)).rejects.toThrow(ConflictError);
  });
});

describe('AuthService.login', () => {
  it('issues an access token and stores a hashed refresh token', async () => {
    (UserModel.findByCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (RefreshTokenModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await AuthService.login('ada@example.com', 'super-secret-password-123');

    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(RefreshTokenModel.create).toHaveBeenCalledOnce();
    // The raw refresh token must never be stored — only its hash.
    const stored = (RefreshTokenModel.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      tokenHash: string;
    };
    expect(stored.tokenHash).not.toBe(result.tokens.refreshToken);
  });

  it('propagates authentication failures', async () => {
    (UserModel.findByCredentials as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AuthenticationError('Invalid email or password'),
    );
    await expect(AuthService.login('ada@example.com', 'wrong-password-123')).rejects.toThrow(
      AuthenticationError,
    );
  });
});
