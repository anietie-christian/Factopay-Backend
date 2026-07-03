# Auth & Identity Bounded Context — Developer Guide
**Owner:** Oscar  
**Stack:** TypeScript · NestJS · Passport JWT / Bcrypt

---

## 1. Context Overview

The `auth-identity` module handles all aspects of user authentication, secure registration, credential storage (using salted Bcrypt hashes), multi-factor OTP verification logic, and JWT payload generation. 

It exposes the secure entry points to the application and exports security strategies to authenticate other bounded contexts.

---

## 2. Technical Requirements & Rules

1. **Strict Types:** No `any` types in any of the domain or application layers.
2. **Password Security:** Passwords are never stored in plain text. Always hash using Bcrypt with a salt rounds value of `10`.
3. **JWT Expiration:** 
   - Access Token: `15 minutes` (short-lived).
   - Refresh Token: `7 days` (long-lived).
4. **Mock OTP Rule:** For the 14-day MVP Sprint, the OTP validation code is hardcoded to accept `'123456'` as a valid verification code.
5. **Decoupled Entities:** Other modules must use `IUserRepository` (token: `USER_REPOSITORY_TOKEN`) to retrieve user states instead of writing custom user-table queries inside their own bounded contexts.

---

## 3. Directory Layout

The context follows the Clean DDD directory architecture:

```
src/modules/auth-identity/
├── domain/
│   ├── models/                  # User entity domain model
│   └── repositories/            # IUserRepository contract interface
├── application/
│   ├── dtos/                    # Input Validation DTOs (Register, Login, VerifyOtp)
│   └── use-cases/               # Use cases (RegisterUser, Login, VerifyOtp)
└── infrastructure/
    ├── controllers/             # AuthController (routing and http boundaries)
    ├── persistence/             # PrismaUserRepository database mapping
    └── strategy/                # Passport JWT validation strategy
```

---

## 4. API Specification

All endpoints are versioned under `/api/v1/auth/*`:

### 4.1 Register User
- **Route:** `POST /api/v1/auth/register`
- **Request Payload:** `RegisterDto`
- **Response:** `{ userId: string; message: string }`

### 4.2 User Login
- **Route:** `POST /api/v1/auth/login`
- **Request Payload:** `LoginDto`
- **Response:** `{ accessToken: string; refreshToken: string; userId: string; email: string; kycStatus: string }`

### 4.3 Verify OTP
- **Route:** `POST /api/v1/auth/verify-otp`
- **Request Payload:** `VerifyOtpDto`
- **Response:** `{ success: boolean; message: string }`

---

## 5. Usage in Other Modules

### 5.1 Route Protection (JWT Authentication)
To protect endpoints in other modules, import `AuthIdentityModule` in the destination module, then apply the NestJS `AuthGuard`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('protected-route')
export class ProtectedController {
  @Get()
  @UseGuards(AuthGuard('jwt'))
  getDashboardData() {
    return { data: 'Secure Fintech Analytics' };
  }
}
```

### 5.2 Retrieving User Information
The authenticated user details are injected into the request object:

```typescript
import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('profile')
export class ProfileController {
  @Get()
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req) {
    // req.user contains { id, email, role, kycStatus }
    return req.user;
  }
}
```

---

## 6. OTP Handoff (SMS & Email Dispatch)

### 6.1 Responsibility Breakdown
- **Oscar (Auth-Identity Module)**:
  - Generates the OTP request during registration or security challenges.
  - Generates and stores/caches the OTP code.
  - Implements the validation state machine logic (e.g., verifying if the code matches and updating `isEmailVerified`/`isPhoneVerified`).
- **Christian (Lead Dev - Shared/Operations Kernel)**:
  - Integrates the physical **SendGrid** (for email delivery) and **Twilio** (for SMS delivery) SDKs/adapters.
  - Subscribes to the registration and security events or exposes a dispatch interface inside `shared/` to physically send the SMS/Email.

### 6.2 Implementation Detail
Upon successful registration in `RegisterUserUseCase`, two verification tasks are created:
1. **Email OTP**: Sent using **SendGrid** API to verify user's email address.
2. **SMS OTP**: Sent using **Twilio** API to verify user's mobile number.

In production:
1. The use case will publish a `UserRegisteredEvent` via NestJS `EventEmitter2` or a message queue (BullMQ).
2. The Event Listener in Christian's shared/operations module will pick up the event and trigger:
   - **SendGrid Adapter** for the Email verification code.
   - **Twilio Adapter** for the SMS verification code.

