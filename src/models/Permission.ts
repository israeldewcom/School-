import mongoose, { Schema, Document } from 'mongoose';

export interface IPermission extends Document {
  role: string;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema<IPermission>(
  {
    role: { type: String, required: true, unique: true },
    permissions: [{ type: String }],
  },
  { timestamps: true }
);

export const Permission = mongoose.model<IPermission>('Permission', PermissionSchema);
