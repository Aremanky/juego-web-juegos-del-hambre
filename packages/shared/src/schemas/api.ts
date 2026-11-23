import { z } from 'zod';
import { cleanText } from './character.js';

/** Códigos de error comunes de API y sockets. */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unsupported_media'
  | 'limit_reached'
  | 'invalid_state'
  | 'internal';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: ApiError };

// ---------- Autenticación ----------
export const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'El usuario necesita al menos 3 caracteres')
  .max(20, 'Máximo 20 caracteres')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, punto, guion y guion bajo');

export const PasswordSchema = z.string().min(8, 'La contraseña necesita al menos 8 caracteres').max(128);

export const DisplayNameSchema = z.string().transform(cleanText).pipe(z.string().min(2, 'Mínimo 2 caracteres').max(24, 'Máximo 24 caracteres'));

export const RegisterSchema = z.object({
  username: UsernameSchema,
  displayName: DisplayNameSchema,
  password: PasswordSchema,
  registrationCode: z.string().max(128).optional(),
});

export const LoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});

export const UpdateProfileSchema = z.object({ displayName: DisplayNameSchema });

export type UserRole = 'user' | 'admin';

export interface UserDTO {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  defaultPhoto: { id: string; v: number } | null;
  createdAt: string;
}

export interface ServerInfoDTO {
  appName: string;
  registrationRequiresCode: boolean;
  version: string;
}

// ---------- Fotos ----------
export const CropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
  })
  .refine((c) => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, 'Recorte fuera de la imagen');
export type Crop = z.infer<typeof CropSchema>;

export const PhotoTagsSchema = z.array(z.string().transform(cleanText).pipe(z.string().min(1).max(20))).max(8);

export const PhotoUpdateSchema = z.object({
  label: z.string().transform(cleanText).pipe(z.string().max(40)).optional(),
  tags: PhotoTagsSchema.optional(),
  crop: CropSchema.optional(),
  isDefault: z.literal(true).optional(),
});

export const PHOTO_VARIANTS = ['original', 'avatar', 'marker', 'thumb'] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

export interface PhotoDTO {
  id: string;
  label: string;
  tags: string[];
  width: number;
  height: number;
  crop: Crop;
  v: number;
  isDefault: boolean;
  createdAt: string;
}

export function photoUrl(id: string, variant: PhotoVariant, v = 0): string {
  return `/api/photos/${id}/${variant}?v=${v}`;
}

// ---------- Chat ----------
export const ChatChannelSchema = z.enum(['global', 'room']);
export type ChatChannel = z.infer<typeof ChatChannelSchema>;
export const ChatSendSchema = z.object({
  channel: ChatChannelSchema,
  body: z.string().transform(cleanText).pipe(z.string().min(1).max(400)),
});

export interface ChatMessageDTO {
  id: string;
  channel: ChatChannel;
  roomId: string | null;
  user: { id: string; displayName: string; photo: { id: string; v: number } | null };
  body: string;
  createdAt: string;
  system?: boolean;
}
