-- Migration: Add title column to client_requests table
-- This migration adds a title column to allow titles for client requests

-- Add title column (nullable, as existing requests won't have titles)
ALTER TABLE client_requests 
ADD COLUMN IF NOT EXISTS title TEXT;

-- Add a comment to the column
COMMENT ON COLUMN client_requests.title IS 'Título opcional del requerimiento';

