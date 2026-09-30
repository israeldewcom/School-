// src/models/HostelRoom.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IHostelRoom extends Document {
  schoolId: mongoose.Types.ObjectId;
  hostelId: mongoose.Types.ObjectId;
  roomNumber: string;
  floor?: number;
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HostelRoomSchema = new Schema<IHostelRoom>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    hostelId: { type: Schema.Types.ObjectId, ref: 'Hostel', required: true, index: true },
    roomNumber: { type: String, required: true, trim: true },
    floor: { type: Number },
    capacity: { type: Number, required: true, min: 1, max: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

HostelRoomSchema.index({ hostelId: 1, roomNumber: 1 }, { unique: true });

export const HostelRoom = mongoose.model<IHostelRoom>('HostelRoom', HostelRoomSchema);
