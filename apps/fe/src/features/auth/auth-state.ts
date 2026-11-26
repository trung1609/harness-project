import { ApiError } from '../../lib/api/client';
import type { AuthAccount, AuthApiClient } from './auth-api';

export type AuthOutcome =
  | { kind: 'registered'; message: string }
  | { kind: 'activated'; message: string }
  | { kind: 'activation_expired'; message: string; canResend: true }
  | { kind: 'resent'; message: string }
  | { kind: 'signed_in'; account: AuthAccount }
  | { kind: 'pending_account'; message: string; canResend: true }
  | { kind: 'locked_account'; message: string; unlockPath: '/unlock' }
  | { kind: 'session_valid' }
  | { kind: 'session_revoked'; message: string; redirectTo: '/login' }
  | { kind: 'error'; message: string };

/**
 * Coordinates frontend auth flows and maps backend error codes to UI states.
 */
export function createAuthWorkflow(api: AuthApiClient) {
  return {
    async register(email: string, password: string): Promise<AuthOutcome> {
      try {
        await api.register(email, password);
        return {
          kind: 'registered',
          message:
            'Đăng ký thành công. Vui lòng kiểm tra email để kích hoạt tài khoản.',
        };
      } catch (err: unknown) {
        if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_EXISTS') {
          return { kind: 'error', message: 'Email này đã được đăng ký.' };
        }
        return {
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Không thể đăng ký tài khoản.',
        };
      }
    },

    async activate(token: string): Promise<AuthOutcome> {
      try {
        await api.activate(token);
        return {
          kind: 'activated',
          message: 'Kích hoạt tài khoản thành công. Bạn có thể đăng nhập ngay.',
        };
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 410) {
          return {
            kind: 'activation_expired',
            message:
              'Liên kết kích hoạt đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại.',
            canResend: true,
          };
        }
        return {
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Không thể kích hoạt tài khoản.',
        };
      }
    },

    async resendActivation(email: string): Promise<AuthOutcome> {
      try {
        await api.resendActivation(email);
        return {
          kind: 'resent',
          message:
            'Nếu email đang chờ kích hoạt, một liên kết mới đã được gửi tới hộp thư của bạn.',
        };
      } catch (err: unknown) {
        return {
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Không thể gửi lại email kích hoạt.',
        };
      }
    },

    async signIn(email: string, password: string): Promise<AuthOutcome> {
      try {
        const res = await api.signIn(email, password);
        return { kind: 'signed_in', account: res.account };
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.code === 'ACCOUNT_PENDING') {
            return {
              kind: 'pending_account',
              message:
                'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email hoặc gửi lại liên kết kích hoạt.',
              canResend: true,
            };
          }
          if (err.code === 'ACCOUNT_LOCKED') {
            return {
              kind: 'locked_account',
              message:
                'Tài khoản đang bị khóa. Bạn có thể gửi yêu cầu mở khóa tài khoản.',
              unlockPath: '/unlock',
            };
          }
          if (err.status === 401) {
            return {
              kind: 'error',
              message: 'Email hoặc mật khẩu không đúng.',
            };
          }
        }
        return {
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Đăng nhập không thành công.',
        };
      }
    },

    async restoreProtectedSession(): Promise<AuthOutcome> {
      try {
        await api.checkProtectedSession();
        return { kind: 'session_valid' };
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          return {
            kind: 'session_revoked',
            message: 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi.',
            redirectTo: '/login',
          };
        }
        return {
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Không thể xác minh phiên đăng nhập.',
        };
      }
    },
  };
}
