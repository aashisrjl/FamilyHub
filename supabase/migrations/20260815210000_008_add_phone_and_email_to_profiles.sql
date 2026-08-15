/*
  # Add phone_number and email columns to profiles table

  Allows family members to store their mobile number and email in their profile
  for quick contacts, status dialogues, and phone calls/SMS.
*/

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone_number text,
ADD COLUMN IF NOT EXISTS email text;

-- Sync emails from auth.users into profiles table
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');
