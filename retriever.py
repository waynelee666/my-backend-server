import os
import sys
import glob
import numpy as np
import jieba

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ============ TF-IDF 检索引擎（纯 Python，零模型依赖） ============
_vocab = {}      # word → index
_idf = None      # IDF 权重向量

def _tokenize(text):
    """jieba 中文分词，过滤单字和空白"""
    return [w.strip() for w in jieba.cut(text) if len(w.strip()) > 1]

def _build_vocab(chunk_list):
    """从文档列表构建词汇表"""
    vocab = {}
    for chunk in chunk_list:
        for word in _tokenize(chunk["text"]):
            if word not in vocab:
                vocab[word] = len(vocab)
    return vocab

def _compute_idf(chunk_list, vocab):
    """计算每个词的 IDF 值"""
    n_docs = len(chunk_list)
    df = np.zeros(len(vocab))
    for chunk in chunk_list:
        unique_words = set(_tokenize(chunk["text"]))
        for w in unique_words:
            if w in vocab:
                df[vocab[w]] += 1
    return np.log((n_docs + 1) / (df + 1)) + 1.0

def _tfidf_vector(text, vocab, idf):
    """将文本转为归一化 TF-IDF 向量"""
    words = _tokenize(text)
    if not words:
        return np.zeros(len(vocab))
    tf = np.zeros(len(vocab))
    for w in words:
        if w in vocab:
            tf[vocab[w]] += 1
    tf = tf / len(words)
    vec = tf * idf
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec

# ============ 公开 API（与 server.py 对接） ============

def load_knowledge(folder="knowledge"):
    """加载知识库，按段落切分"""
    chunks = []
    for path in sorted(glob.glob(os.path.join(folder, "*.txt"))):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for para in text.split("\n\n"):
            para = para.strip()
            if para:
                chunks.append({"text": para})
    return chunks

def build_vector(chunk_list):
    """批量构建所有文档的 TF-IDF 向量矩阵"""
    global _vocab, _idf
    _vocab = _build_vocab(chunk_list)
    _idf = _compute_idf(chunk_list, _vocab)
    return np.array([_tfidf_vector(c["text"], _vocab, _idf) for c in chunk_list])

def encode_query(query: str):
    """将查询文本编码为归一化向量"""
    return _tfidf_vector(query, _vocab, _idf)

# ============ 自测 ============
if __name__ == "__main__":
    print("=== TF-IDF 检索自测 ===")
    chunks = load_knowledge()
    vecs = build_vector(chunks)
    print(f"词汇表大小: {len(_vocab)}")
    print(f"文档数量: {len(chunks)}")
    while True:
        q = input("\n问题（quit退出）：")
        if q.strip().lower() == "quit":
            break
        q_vec = encode_query(q)
        scores = np.dot(vecs, q_vec)
        top = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:5]
        for idx, s in top:
            if s > 0.05:
                print(f"  相似度 {s:.3f}  [{idx+1}] {chunks[idx]['text'][:120]}...")
