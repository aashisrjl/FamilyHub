/*
  # Add push_token column to profiles table

  Allows family members to store their Expo Push Notification Token for real-time mobile push alerts.
*/

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS push_token text;
