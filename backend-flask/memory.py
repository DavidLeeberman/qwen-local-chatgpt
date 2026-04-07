import chromadb
from sentence_transformers import SentenceTransformer

embed_model = SentenceTransformer("all-MiniLM-L6-v2")
client = chromadb.Client()
collection = client.create_collection("memory")


def embed(text):
    return embed_model.encode(text).tolist()


def store(user_id, text):
    collection.add(
        documents=[text],
        embeddings=[embed(text)],
        ids=[f"{user_id}-{hash(text)}"],
        metadatas=[{"user_id": user_id}]
    )


def retrieve(user_id, query):
    results = collection.query(
        query_embeddings=[embed(query)],
        n_results=3
    )
    return "\n".join(results["documents"][0]) if results["documents"] else ""