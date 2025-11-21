# Upload de Foto de Capa do Projeto - Painel Admin

## Endpoints Disponíveis

### 1. Upload/Atualizar Foto de Capa

**POST** `/project/:id/cover-photo`

Faz upload de uma nova foto de capa para o projeto. Se já existir uma foto, ela será substituída.

#### Headers
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

#### Parâmetros
- `id` (URL) - ID do projeto
- `file` (FormData) - Arquivo de imagem (JPG, PNG, etc.)

#### Exemplo de Request (JavaScript/Fetch)
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]); // fileInput é um input type="file"

const response = await fetch(`/project/${projectId}/cover-photo`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
// result = {
//   success: true,
//   data: {
//     id: "project-uuid",
//     cover_photo: "https://presigned-url...",
//     fileName: "hash-filename.webp"
//   },
//   message: "Cover photo uploaded successfully"
// }
```

#### Exemplo de Request (React/HTML)
```jsx
const handleUploadCoverPhoto = async (projectId, file) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`/project/${projectId}/cover-photo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Foto de capa enviada com sucesso!');
      console.log('URL:', result.data.cover_photo);
      // Atualizar estado/localStorage com a nova URL
    }
  } catch (error) {
    console.error('Erro ao enviar foto:', error);
  }
};

// No componente
<input 
  type="file" 
  accept="image/*" 
  onChange={(e) => {
    const file = e.target.files[0];
    if (file) {
      handleUploadCoverPhoto(projectId, file);
    }
  }}
/>
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "data": {
    "id": "project-uuid",
    "cover_photo": "https://presigned-url...",
    "fileName": "hash-filename.webp"
  },
  "message": "Cover photo uploaded successfully"
}
```

#### Erros Possíveis
- **400** - No file uploaded
- **404** - Project not found
- **500** - Internal server error

---

### 2. Remover Foto de Capa

**DELETE** `/project/:id/cover-photo`

Remove a foto de capa do projeto.

#### Headers
```
Authorization: Bearer {token}
```

#### Parâmetros
- `id` (URL) - ID do projeto

#### Exemplo de Request
```javascript
const response = await fetch(`/project/${projectId}/cover-photo`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const result = await response.json();
// result = {
//   success: true,
//   message: "Cover photo deleted successfully"
// }
```

#### Resposta de Sucesso (200)
```json
{
  "success": true,
  "message": "Cover photo deleted successfully"
}
```

#### Erros Possíveis
- **400** - Project does not have a cover photo
- **404** - Project not found
- **500** - Internal server error

---

## Implementação no Frontend Admin

### Exemplo Completo (React)

```jsx
import React, { useState } from 'react';

const ProjectCoverPhotoUpload = ({ projectId, currentCoverPhoto, onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentCoverPhoto);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Preview local
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/project/${projectId}/cover-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setPreview(result.data.cover_photo);
        onUploadSuccess?.(result.data.cover_photo);
        alert('Foto de capa atualizada com sucesso!');
      } else {
        alert('Erro ao enviar foto');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao enviar foto');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Deseja remover a foto de capa?')) return;

    try {
      const response = await fetch(`/project/${projectId}/cover-photo`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setPreview(null);
        onUploadSuccess?.(null);
        alert('Foto de capa removida com sucesso!');
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao remover foto');
    }
  };

  return (
    <div className="cover-photo-upload">
      {preview && (
        <div className="preview">
          <img src={preview} alt="Cover" style={{ maxWidth: '300px', maxHeight: '200px' }} />
        </div>
      )}
      
      <div className="actions">
        <label className="upload-button">
          {uploading ? 'Enviando...' : 'Escolher Foto'}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
        
        {preview && (
          <button onClick={handleDelete} disabled={uploading}>
            Remover Foto
          </button>
        )}
      </div>
    </div>
  );
};

export default ProjectCoverPhotoUpload;
```

### Exemplo com Axios

```javascript
import axios from 'axios';

const uploadCoverPhoto = async (projectId, file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post(
    `/project/${projectId}/cover-photo`,
    formData,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    }
  );

  return response.data;
};

const deleteCoverPhoto = async (projectId) => {
  const response = await axios.delete(
    `/project/${projectId}/cover-photo`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  return response.data;
};
```

---

## Notas Importantes

1. **Formato da Imagem**: A imagem será automaticamente convertida para WebP e otimizada
2. **Substituição Automática**: Se já existir uma foto de capa, ela será automaticamente substituída e a antiga será deletada do S3
3. **URL Pré-assinada**: A resposta inclui uma URL pré-assinada válida por um período determinado
4. **Tamanho**: Recomenda-se imagens com boa qualidade, mas o sistema fará otimização automática
5. **Aspect Ratio**: Para melhor visualização no app, recomenda-se usar imagens com aspect ratio 16:9 ou similar

---

## Integração com o App

A foto de capa será automaticamente retornada na rota:
- `GET /projects-grouped-by-address` - No campo `cover_photo` de cada projeto

Se não houver foto de capa, o sistema usará a primeira foto do primeiro serviço do projeto como fallback.

