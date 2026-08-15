export type MemberStatus = 'online' | 'away' | 'dnd';

export type TankType = 'top' | 'down';

export type Priority = 'high' | 'medium' | 'low';

export type MediaType = 'image' | 'audio' | 'file';

export type QuickActionType = 'motor' | 'alarm' | 'custom';

export interface QuickAction {
  id: string;
  family_id: string;
  title: string;
  action_type: QuickActionType;
  tank?: TankType | null;
  default_duration_minutes: number;
  icon?: string | null;
  color?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface Family {
  id: string;
  name: string;
  code: string;
  created_by: string;
  created_at: string;
  is_gate_locked?: boolean;
  home_latitude?: number | null;
  home_longitude?: number | null;
  home_address_name?: string | null;
  home_radius_meters?: number | null;
}

export interface Profile {
  id: string;
  family_id: string | null;
  display_name: string;
  avatar_url: string | null;
  status: MemberStatus;
  role?: 'admin' | 'member';
  phone_number?: string | null;
  email?: string | null;
  fcm_token: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_updated_at?: string | null;
  created_at: string;
}

export interface MotorSession {
  id: string;
  family_id: string;
  tank: TankType;
  started_by: string;
  started_at: string;
  duration_minutes: number;
  is_active: boolean;
  ended_at: string | null;
}

export interface SosAlert {
  id: string;
  family_id: string;
  sent_by: string;
  created_at: string;
  acknowledged_at: string | null;
}

export interface Task {
  id: string;
  family_id: string | null;
  user_id: string;
  title: string;
  due_at: string | null;
  priority: Priority;
  assignee_id: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  family_id: string;
  sender_id: string;
  recipient_id: string | null;
  text: string | null;
  media_url: string | null;
  media_type: MediaType | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface RingAlert {
  id: string;
  family_id: string;
  sender_id: string;
  target_id: string | null;
  created_at: string;
}
