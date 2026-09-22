import { IsString, IsUUID, MinLength } from 'class-validator';

export class CheckSdkDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1)
  publicKey!: string;
}
