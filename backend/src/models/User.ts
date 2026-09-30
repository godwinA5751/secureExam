import { Schema, model, Document, Types } from "mongoose";

export type Role = "lecturer" | "student";

export interface IUser extends Document {
  _id: Types.ObjectId;
  role: Role;
  idNumber?: string; // student login identifier
  email?: string; // lecturer login identifier
  name: string;
  passwordHash?: string; // lecturer only
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  role: { 
    type: String, 
    enum: ["lecturer", "student"], 
    required: true 
  },
  
  idNumber: { 
    type: String, 
    index: true, 
    sparse: true, 
    unique: true 
  },

  email: { 
    type: String, 
    index: true, 
    sparse: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },

  name: { 
    type: String, 
    required: true, 
    trim: true 
  },

  passwordHash: { 
    type: String, 
    select: false 
  },

  failedLoginAttempts: { 
    type: Number, 
    default: 0 
  },

  lockedUntil: { 
    type: Date, 
    default: null 
  },

  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

export const User = model<IUser>("User", UserSchema);
