export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { query, location, type, page } = req.query;

  try {
    const params = new URLSearchParams({
      query: query || "Data Analyst",
      location: location || "United States",
      remote_jobs_only: "false",
      employment_types: type || "FULLTIME",
      page: page || "1",
      num_pages: "1",
    });

    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search?${params}`,
      {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      }
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
