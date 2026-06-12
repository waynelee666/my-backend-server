import os
import sys
import glob
import numpy as np
from fastembed import TextEmbedding

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ============ 模型加载（FastEmbed + ONNX，无需 PyTorch） ============
model_path = "./local_model"
_model = None

def _get_model():
    """延迟加载模型，避免启动时 OOM"""
    global _model
    if _model is None:
        if os.path.exists(model_path):
            _model = TextEmbedding(model_name=model_path, providers=["CPUExecutionProvider"])
        else:
            _model = TextEmbedding(model_name="BAAI/bge-small-zh-v1.5", providers=["CPUExecutionProvider"])
    return _model

def _normalize(vecs):
    """L2 归一化"""
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return vecs / norms

# ============ 加载知识库 ============
def load_knowledge(folder="knowledge"):
    chunks = []
    for path in sorted(glob.glob(os.path.join(folder, "*.txt"))):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for para in text.split("\n\n"):
            para = para.strip()
            if para:
                chunks.append({"text": para})
    return chunks

# ============ 批量向量化文档 ============
def build_vector(chunk_list):
    text_list = [c["text"] for c in chunk_list]
    vecs = np.array(list(_get_model().embed(text_list)))
    return _normalize(vecs)

# ============ 核心检索：带相似度过滤，保留原索引 ============
def retrieve_with_score(query, chunks, top_k=3, threshold=0.2):
    if not chunks:
        return []
    doc_vec = build_vector(chunks)
    q_vec = _normalize(np.array(list(_get_model().embed([query]))))
    score = np.dot(doc_vec, q_vec.T).flatten()
    # 按相似度从高到低排序，同时保留原索引
    idx_score = sorted(enumerate(score), key=lambda x: x[1], reverse=True)
    results = []
    for idx, s in idx_score:
        if s >= threshold:
            results.append((idx + 1, chunks[idx]["text"]))  # 这里的 idx+1 是知识库中的真实序号
            if len(results) >= top_k:
                break
    return results

# ============ 单条查询向量化（供 server.py 调用） ============
def encode_query(query: str):
    """将查询文本编码为归一化向量"""
    vec = np.array(list(_get_model().embed([query])))
    return _normalize(vec)[0]

# ============ 对接main的固定格式 ============
def retrieve_with_id(query, top_k=3):
    all_data = load_knowledge()
    return retrieve_with_score(query, all_data, top_k=top_k)

# ============ 自测 ============
if __name__ == "__main__":
    print("=== 向量检索自测 ===")
    while True:
        q = input("\n问题（quit退出）：")
        if q.strip().lower() == "quit":
            break
        ans = retrieve_with_id(q, top_k=3)
        if not ans:
            print("没有找到相关资料")
            continue
        print(f"相关资料共 {len(ans)} 条：")
        for no, txt in ans:
            print(f"【第{no}条】{txt[:150]}...")
