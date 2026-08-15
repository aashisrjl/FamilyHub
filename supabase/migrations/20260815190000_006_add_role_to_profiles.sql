/*
  # Add role column to profiles table
  
  Allows distinguishing family admins (creators) from standard family members.
  - role: 'admin' | 'member' (defaults to 'member')
*/

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'));
