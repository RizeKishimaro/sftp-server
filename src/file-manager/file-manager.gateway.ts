
import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as SftpClient from 'ssh2-sftp-client';
import * as stream from 'stream';
import * as archiver from "archiver"

@WebSocketGateway(3001, {
  cors: "*",
  namespace: "socket.io"
})
export class FileManagerGateway {
  @WebSocketServer()
  server: Server;

  private isConnected = false;
  private sftp: SftpClient;

  async connectSftp() {
    if (this.sftp) {
      return this.sftp;
    }
    this.sftp = new SftpClient();
    await this.sftp.connect({
      host: 'localhost',
      port: 22,
      username: 'rizekishimaro',
      password: 'admin',
    });
    return this.sftp;
  }

  async closeSftp() {
    if (this.sftp) {
      await this.sftp.end();
      this.sftp = null; // Clear the reference to the SFTP client
    }
  }
  async disconnectSftp() {
    if (this.isConnected) {
      await this.sftp.end();
      this.isConnected = false; // Update connection state
    }
  }

  @SubscribeMessage('listFiles')
  async listFiles(client: any, path: string) {
    await this.connectSftp();
    const files = await this.sftp.list(path || '/');
    client.emit('fileList', files);
    await this.disconnectSftp();
  }

  @SubscribeMessage('uploadFile')
  async uploadFile(client: any, fileData: { path: string; content: Buffer }) {
    await this.connectSftp();
    await this.sftp.put(fileData.content, fileData.path);
    client.emit('fileUploaded', { success: true, path: fileData.path });
    await this.disconnectSftp();
  }

  @SubscribeMessage('downloadFiles')
  async downloadFiles(client: any, remotePaths: string[]) {
    // Check if a download is already in progress for this client
    if (client.downloadInProgress) {
      client.emit('error', 'A download is already in progress.');
      return;
    }

    client.downloadInProgress = true; // Flag to prevent multiple downloads

    try {
      await this.connectSftp();

      // Retrieve the files from SFTP
      const files = await Promise.all(remotePaths.map(async (path) => {
        const content = await this.sftp.get(path); // Ensure this returns a Buffer
        return { path, content };
      }));

      // Create a writable stream for the archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Set the compression level
      });

      // Emit chunks of the archive to the client
      archive.on('data', (chunk) => {
        client.emit('downloadedFilesChunk', chunk);
      });

      archive.on('end', () => {
        client.downloadInProgress = false; // Reset the flag
        client.emit('downloadedFilesComplete'); // Notify client when complete
      });

      // Create a PassThrough stream to pipe the archive
      const passThroughStream = new stream.PassThrough();
      archive.pipe(passThroughStream);

      // Add each file to the archive with its original path
      for (const { path, content } of files) {
        const fileName = path.split('/').pop(); // Get the file name only
        const dirName = path.substring(0, path.lastIndexOf('/')); // Get the directory path
        archive.append(content, { name: `${dirName}/${fileName}` });
      }

      // Finalize the archive only after all files have been appended
      await archive.finalize(); // This should be after the loop
    } catch (error) {
      console.error('Error during download:', error);
      client.emit('error', 'An error occurred while processing your request.');
    } finally {
      client.downloadInProgress = false; // Ensure the flag is reset
      await this.disconnectSftp();
    }
  }
  @SubscribeMessage('deleteFile')
  async deleteFile(client: any, filePath: string) {
    await this.connectSftp();
    const result = await this.sftp.delete(filePath);
    client.emit('fileDeleted', { success: result, path: filePath });
    await this.disconnectSftp();
  }

  @SubscribeMessage('renameFile')
  async renameFile(client: any, { oldPath, newPath }: { oldPath: string; newPath: string }) {
    await this.connectSftp();
    const result = await this.sftp.rename(oldPath, newPath);
    client.emit('fileRenamed', { success: result, oldPath, newPath });
    await this.disconnectSftp();
  }

  @SubscribeMessage('createItem')
  async createItem(client: any, { path, isFolder }: { path: string; isFolder: boolean }) {
    await this.connectSftp();
    if (isFolder) {
      await this.sftp.mkdir(path);
    } else {
      await this.sftp.put(Buffer.from(''), path); // Create an empty file
    }
    client.emit('itemCreated', { success: true, path });
    await this.disconnectSftp();
  }
}

