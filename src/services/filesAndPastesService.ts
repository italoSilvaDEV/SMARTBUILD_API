/**
 * NOTA IMPORTANTE:
 * Este arquivo deve ser usado no FRONTEND, não no backend.
 * Ajuste o caminho do import do apiArpPro conforme a estrutura do seu projeto.
 * Exemplo: import apiArpPro from "@/services/apiServer" ou "../api/apiServer"
 */
import apiArpPro from "../apiServer";
import {
  CreateFileRequest,
  CreateFileResponse,
  GetFilesParams,
  GetFilesResponse,
  GetFileParams,
  GetFileResponse,
  GetFilesByPasteParams,
  GetFilesByPasteResponse,
  UpdateFileRequest,
  UpdateFileResponse,
  DeleteFileParams,
  DeleteFileResponse,
  CreatePasteRequest,
  CreatePasteResponse,
  GetPastesParams,
  GetPastesResponse,
  GetPasteParams,
  GetPasteResponse,
  UpdatePasteRequest,
  UpdatePasteResponse,
  DeletePasteParams,
  DeletePasteResponse,
} from "./types";

// ============================================
// FILES - FUNÇÕES
// ============================================

/**
 * Cria um novo arquivo com upload
 * @param file - Arquivo a ser enviado
 * @param data - Dados do arquivo (userId, projectId, companyId, name, description, pasteId)
 * @returns Promise com a resposta da API
 */
export const createFile = async (
  file: File,
  data: CreateFileRequest
): Promise<CreateFileResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  if (data.name) formData.append("name", data.name);
  if (data.description) formData.append("description", data.description);
  if (data.pasteId) formData.append("pasteId", data.pasteId);
  formData.append("userId", data.userId);
  formData.append("projectId", data.projectId);
  formData.append("companyId", data.companyId);

  const response = await apiArpPro.post<CreateFileResponse>("/file", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

/**
 * Busca todos os arquivos de um projeto
 * @param params - Parâmetros (projectId, userId)
 * @returns Promise com array de arquivos
 */
export const getFiles = async (
  params: GetFilesParams
): Promise<GetFilesResponse> => {
  const response = await apiArpPro.get<GetFilesResponse>(
    `/files/${params.projectId}/${params.userId}`
  );

  return response.data;
};

/**
 * Busca um arquivo específico
 * @param params - Parâmetros (id, userId, projectId)
 * @returns Promise com os dados do arquivo
 */
export const getFile = async (
  params: GetFileParams
): Promise<GetFileResponse> => {
  const response = await apiArpPro.get<GetFileResponse>(
    `/file/get/${params.id}/${params.userId}/${params.projectId}`
  );

  return response.data;
};

/**
 * Busca todos os arquivos de uma pasta específica
 * @param params - Parâmetros (pasteId, userId, projectId)
 * @returns Promise com array de arquivos da pasta
 */
export const getFilesByPaste = async (
  params: GetFilesByPasteParams
): Promise<GetFilesByPasteResponse> => {
  const response = await apiArpPro.get<GetFilesByPasteResponse>(
    `/files/paste/${params.pasteId}/${params.userId}/${params.projectId}`
  );

  return response.data;
};

/**
 * Atualiza um arquivo (nome, descrição ou arquivo físico)
 * @param data - Dados a serem atualizados (id, name, description)
 * @param file - Novo arquivo (opcional)
 * @returns Promise com os dados do arquivo atualizado
 */
export const updateFile = async (
  data: UpdateFileRequest,
  file?: File
): Promise<UpdateFileResponse> => {
  const formData = new FormData();
  formData.append("id", data.id);
  if (data.name) formData.append("name", data.name);
  if (data.description) formData.append("description", data.description);
  if (file) formData.append("file", file);

  const response = await apiArpPro.put<UpdateFileResponse>("/file", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

/**
 * Deleta um arquivo
 * @param params - Parâmetros (id)
 * @returns Promise com confirmação da exclusão
 */
export const deleteFile = async (
  params: DeleteFileParams
): Promise<DeleteFileResponse> => {
  const response = await apiArpPro.delete<DeleteFileResponse>(
    `/file/${params.id}`
  );

  return response.data;
};

// ============================================
// PASTES - FUNÇÕES
// ============================================

/**
 * Cria uma nova pasta
 * @param data - Dados da pasta (name, userId, projectId, companyId)
 * @returns Promise com os dados da pasta criada
 */
export const createPaste = async (
  data: CreatePasteRequest
): Promise<CreatePasteResponse> => {
  const response = await apiArpPro.post<CreatePasteResponse>("/pastes", data);

  return response.data;
};

/**
 * Busca todas as pastas de um projeto
 * @param params - Parâmetros (projectId)
 * @returns Promise com array de pastas
 */
export const getPastes = async (
  params: GetPastesParams
): Promise<GetPastesResponse> => {
  const response = await apiArpPro.get<GetPastesResponse>(
    `/pastes/project/${params.projectId}`
  );

  return response.data;
};

/**
 * Busca uma pasta específica
 * @param params - Parâmetros (id)
 * @returns Promise com os dados da pasta
 */
export const getPaste = async (
  params: GetPasteParams
): Promise<GetPasteResponse> => {
  const response = await apiArpPro.get<GetPasteResponse>(
    `/pastes/${params.id}`
  );

  return response.data;
};

/**
 * Atualiza (renomeia) uma pasta
 * @param data - Dados a serem atualizados (id, name)
 * @returns Promise com os dados da pasta atualizada
 */
export const updatePaste = async (
  data: UpdatePasteRequest
): Promise<UpdatePasteResponse> => {
  const response = await apiArpPro.put<UpdatePasteResponse>(
    "/pastes/rename",
    data
  );

  return response.data;
};

/**
 * Deleta uma pasta
 * @param params - Parâmetros (id)
 * @returns Promise com confirmação da exclusão
 */
export const deletePaste = async (
  params: DeletePasteParams
): Promise<DeletePasteResponse> => {
  const response = await apiArpPro.delete<DeletePasteResponse>(
    `/pastes/${params.id}`
  );

  return response.data;
};
