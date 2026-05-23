import { Readable } from 'stream';

export interface IStorageAdapter {
  /**
   * Save a file from a stream
   * @param stream - The readable stream containing file data
   * @param filename - The filename to save as
   * @returns Promise with filepath and size in bytes
   */
  save(stream: Readable, filename: string): Promise<{ filepath: string; sizeBytes: number }>;

  /**
   * Get a readable stream for a file
   * @param filepath - The full path to the file
   * @returns Promise with readable stream
   */
  getReadStream(filepath: string): Promise<Readable>;

  /**
   * Delete a file
   * @param filepath - The full path to the file
   */
  delete(filepath: string): Promise<void>;

  /**
   * List all files in storage
   * @returns Promise with array of filenames
   */
  list(): Promise<string[]>;

  /**
   * Get the full path for a filename
   * @param filename - The filename
   * @returns The full path
   */
  getPath(filename: string): string;

  /**
   * Get file statistics
   * @param filepath - The full path to the file
   * @returns Promise with size in bytes
   */
  getStats(filepath: string): Promise<{ sizeBytes: number }>;
}