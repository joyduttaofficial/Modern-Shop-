-- Create a unified collection table for high-performance JSONB storage
CREATE TABLE IF NOT EXISTS store_collections (
  id TEXT NOT NULL,
  collection TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (collection, id)
);

-- Enable Realtime for this table to allow instant multi-user syncing
ALTER TABLE store_collections ENABLE ROW LEVEL SECURITY;

-- Disable Row Level Security restriction for public demo access or define standard policies
CREATE POLICY "Allow public read/write access" ON store_collections FOR ALL USING (true) WITH CHECK (true);

-- Add to Realtime publication to broadcast database changes to listening browser instances
ALTER PUBLICATION supabase_realtime ADD TABLE store_collections;
