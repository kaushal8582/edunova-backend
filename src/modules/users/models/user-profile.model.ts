import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  EDUCATION_LEVELS,
  EducationLevel,
  GENDERS,
  Gender,
  MODEL_NAMES,
  THEME_PREFERENCES,
  ThemePreference,
} from '../../shared/constants';

/**
 * Personal / preference data kept separate from authentication credentials.
 * Do not store passwords, tokens, or other secrets here.
 */
export interface IUserProfileAvatar {
  storageKey: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface IUserProfileEducation {
  level?: EducationLevel;
  classOrYear?: string;
  institution?: string;
  board?: string;
  course?: string;
}

export interface IUserProfileLocation {
  city?: string;
  state?: string;
  country?: string;
}

export interface IUserProfilePreferences {
  language?: string;
  theme?: ThemePreference;
  notificationsEnabled?: boolean;
}

export interface IUserProfile {
  userId: Types.ObjectId;
  fullName: string;
  displayName?: string;
  avatar?: IUserProfileAvatar;
  dateOfBirth?: Date;
  /** Controlled enum with OTHER for extensibility without schema migrations. */
  gender?: Gender;
  education?: IUserProfileEducation;
  location?: IUserProfileLocation;
  preferences?: IUserProfilePreferences;
  createdAt: Date;
  updatedAt: Date;
}

export type UserProfileDocument = HydratedDocument<IUserProfile>;

const avatarSchema = new Schema<IUserProfileAvatar>(
  {
    storageKey: { type: String, required: true, trim: true, maxlength: 512 },
    url: { type: String, trim: true, maxlength: 2048 },
    mimeType: { type: String, trim: true, maxlength: 128 },
    sizeBytes: { type: Number, min: 0 },
  },
  { _id: false, strict: true }
);

const educationSchema = new Schema<IUserProfileEducation>(
  {
    level: { type: String, enum: EDUCATION_LEVELS },
    classOrYear: { type: String, trim: true, maxlength: 64 },
    institution: { type: String, trim: true, maxlength: 256 },
    board: { type: String, trim: true, maxlength: 128 },
    course: { type: String, trim: true, maxlength: 256 },
  },
  { _id: false, strict: true }
);

const locationSchema = new Schema<IUserProfileLocation>(
  {
    city: { type: String, trim: true, maxlength: 128 },
    state: { type: String, trim: true, maxlength: 128 },
    country: { type: String, trim: true, maxlength: 128 },
  },
  { _id: false, strict: true }
);

const preferencesSchema = new Schema<IUserProfilePreferences>(
  {
    language: { type: String, trim: true, lowercase: true, maxlength: 16, default: 'en' },
    theme: {
      type: String,
      enum: THEME_PREFERENCES,
      default: ThemePreference.SYSTEM,
    },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { _id: false, strict: true }
);

const userProfileSchema = new Schema<IUserProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: avatarSchema,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: GENDERS,
    },
    education: {
      type: educationSchema,
    },
    location: {
      type: locationSchema,
    },
    preferences: {
      type: preferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: 'user_profiles',
    strict: true,
  }
);

// One profile per user.
userProfileSchema.index({ userId: 1 }, { unique: true, name: 'user_profiles_userId_unique' });

export const UserProfile: Model<IUserProfile> =
  mongoose.models[MODEL_NAMES.UserProfile] ||
  mongoose.model<IUserProfile>(MODEL_NAMES.UserProfile, userProfileSchema);
