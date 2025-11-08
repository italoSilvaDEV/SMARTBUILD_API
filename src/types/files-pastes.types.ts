// ============================================
// ENTIDADES BASE
// ============================================

export interface ProjectFile {
  id: string;
  file: string;
  name: string | null;
  description: string | null;
  pasteId: string | null;
  userAuthorId: string;
  projectId: string;
  companyId: string;
  date_creation: Date | string;
  date_update: Date | string;
}

export interface ProjectPaste {
  id: string;
  name: string;
  userAuthorId: string;
  projectId: string;
  companyId: string;
  date_creation: Date | string;
  date_update: Date | string;
}

// ============================================
// RESPONSES GENÉRICOS
// ============================================

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================
// FILES - CRIAR ARQUIVO
// ============================================

export interface CreateFileRequest {
  name?: string;
  description?: string;
  pasteId?: string;
  userId: string;
  projectId: string;
  companyId: string;
}

export interface CreateFileResponse extends ApiSuccessResponse<ProjectFile> {}

// ============================================
// FILES - BUSCAR TODOS OS ARQUIVOS
// ============================================

export interface GetFilesParams {
  projectId: string;
  userId: string;
}

export interface GetFilesResponse extends ApiSuccessResponse<ProjectFile[]> {}

// ============================================
// FILES - BUSCAR ARQUIVO ESPECÍFICO
// ============================================

export interface GetFileParams {
  id: string;
  userId: string;
  projectId: string;
}

export interface GetFileResponse extends ApiSuccessResponse<ProjectFile> {}

// ============================================
// FILES - BUSCAR ARQUIVOS POR PASTE
// ============================================

export interface GetFilesByPasteParams {
  pasteId: string;
  userId: string;
  projectId: string;
}

export interface GetFilesByPasteResponse extends ApiSuccessResponse<ProjectFile[]> {}

// ============================================
// FILES - ATUALIZAR ARQUIVO
// ============================================

export interface UpdateFileRequest {
  id: string;
  name?: string;
  description?: string;
}

export interface UpdateFileResponse extends ApiSuccessResponse<ProjectFile> {}

// ============================================
// FILES - DELETAR ARQUIVO
// ============================================

export interface DeleteFileParams {
  id: string;
}

export interface DeleteFileResponse {
  success: true;
  message: string;
}

// ============================================
// PASTES - CRIAR PASTA
// ============================================

export interface CreatePasteRequest {
  name: string;
  userId: string;
  projectId: string;
  companyId: string;
}

export interface CreatePasteResponse extends ApiSuccessResponse<ProjectPaste> {}

// ============================================
// PASTES - BUSCAR TODAS AS PASTAS
// ============================================

export interface GetPastesParams {
  projectId: string;
}

export interface GetPastesResponse extends ApiSuccessResponse<ProjectPaste[]> {}

// ============================================
// PASTES - BUSCAR PASTA ESPECÍFICA
// ============================================

export interface GetPasteParams {
  id: string;
}

export interface GetPasteResponse extends ApiSuccessResponse<ProjectPaste> {}

// ============================================
// PASTES - ATUALIZAR PASTA
// ============================================

export interface UpdatePasteRequest {
  id: string;
  name: string;
}

export interface UpdatePasteResponse extends ApiSuccessResponse<ProjectPaste> {}

// ============================================
// PASTES - DELETAR PASTA
// ============================================

export interface DeletePasteParams {
  id: string;
}

export interface DeletePasteResponse {
  success: true;
  message: string;
}
