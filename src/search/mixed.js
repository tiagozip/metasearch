import braveData from "./braveData.js";
import braveFetch from "./braveFetch.js";

export default async function search(
  query,
  page = 0,
  { attempts, clearance, safe, time } = {},
) {
  const resp = await braveFetch(
    `https://search.brave.com/search?q=${encodeURIComponent(
      query,
    )}${page ? `&offset=${page}` : ""}${time ? `&tf=${time}` : ""}&source=web`,
    {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      },
      referrerPolicy: "strict-origin-when-cross-origin",
      method: "GET",
      sniffBlockPage: true,
      attempts,
      clearance,
      safe,
    },
  );

  const raw = await resp.text();

  try {
    const simplified = braveData(raw);

    return {
      pow_low: resp.powLow,
      badResults:
        simplified.badResults || simplified.body.response.query.bad_results,
      more_results_available:
        simplified.body.response.query.more_results_available,
      results: {
        web: simplified.body.response.web
          ? {
              results: simplified.body.response.web.results?.map((r) => ({
                title: r.title,
                url: r.url,
                description: r.description,
                age: r.age,
                meta_url: r.meta_url
                  ? {
                      hostname: r.meta_url.hostname,
                      favicon: r.meta_url.favicon,
                    }
                  : null,
                profile: r.profile
                  ? {
                      name: r.profile.name,
                      img: r.profile.img,
                    }
                  : null,
                thumbnail: r.thumbnail ? { src: r.thumbnail.src } : null,
                deep_results: r.deep_results?.buttons
                  ? {
                      buttons: r.deep_results.buttons.map((b) => ({
                        title: b.title,
                        url: b.url,
                      })),
                    }
                  : null,
                cluster: r.cluster
                  ? r.cluster.map((c) => ({
                      title: c.title,
                      label: c.label,
                      url: c.url,
                      description: c.description,
                    }))
                  : null,
              })),
            }
          : null,

        news: simplified.body.response.news
          ? {
              results: simplified.body.response.news.results?.map((r) => ({
                title: r.title,
                url: r.url,
                age: r.age,
                meta_url: r.meta_url
                  ? {
                      hostname: r.meta_url.hostname,
                      favicon: r.meta_url.favicon,
                    }
                  : null,
                profile: r.profile
                  ? {
                      name: r.profile.name,
                      img: r.profile.img,
                    }
                  : null,
                thumbnail: r.thumbnail ? { src: r.thumbnail.src } : null,
              })),
            }
          : null,

        videos: simplified.body.response.videos
          ? {
              results: simplified.body.response.videos.results?.map((r) => ({
                title: r.title,
                url: r.url,
                age: r.age,
                meta_url: r.meta_url ? { hostname: r.meta_url.hostname } : null,
                profile: r.profile ? { name: r.profile.name } : null,
                thumbnail: r.thumbnail
                  ? { src: r.thumbnail.src, original: r.thumbnail.original }
                  : null,
                video: r.video
                  ? {
                      duration: r.video.duration,
                      creator: r.video.creator,
                      thumbnail: r.video.thumbnail
                        ? {
                            src: r.video.thumbnail.src,
                            original: r.video.thumbnail.original,
                          }
                        : null,
                    }
                  : null,
              })),
            }
          : null,

        discussions: simplified.body.response.discussions
          ? {
              results: simplified.body.response.discussions.results?.map(
                (r) => ({
                  title: r.title,
                  url: r.url,
                  age: r.age,
                  data: r.data
                    ? {
                        forum_name: r.data.forum_name,
                        num_votes: r.data.num_votes,
                        num_answers: r.data.num_answers,
                        question: r.data.question,
                        top_comment: r.data.top_comment,
                      }
                    : null,
                }),
              ),
            }
          : null,

        faq: simplified.body.response.faq
          ? {
              results: simplified.body.response.faq.results?.map((r) => ({
                question: r.question,
                answer: r.answer,
                title: r.title,
                url: r.url,
                meta_url: r.meta_url
                  ? {
                      hostname: r.meta_url.hostname,
                      favicon: r.meta_url.favicon,
                    }
                  : null,
              })),
            }
          : null,

        infobox: simplified.body.response.infobox
          ? {
              results: simplified.body.response.infobox.results?.map((r) => ({
                title: r.title,
                description: r.description,
                long_desc: r.long_desc,
                url: r.url,
                profiles: r.profiles?.map((p) => ({
                  name: p.name,
                  long_name: p.long_name,
                  url: p.url,
                  img: p.img,
                })),
                ratings: r.ratings?.map((rt) => ({
                  ratingValue: rt.ratingValue,
                  bestRating: rt.bestRating,
                })),
                data: r.data,
                images: r.images,
                attributes: r.attributes,
              })),
            }
          : null,

        rich: simplified.body.response.rich?.results?.map((r) => ({
          subtype: r.subtype,
          calculator: r.calculator
            ? {
                expression: r.calculator.expression,
                answer: r.calculator.answer,
              }
            : null,
          colorpicker: r.colorpicker
            ? {
                color: r.colorpicker.color,
                format: r.colorpicker.format,
              }
            : null,
          weather: r.weather
            ? {
                location: r.weather.location
                  ? {
                      name: r.weather.location.name,
                      country: r.weather.location.country,
                      state: r.weather.location.state,
                      lat: r.weather.location.coords?.lat,
                      lon: r.weather.location.coords?.lon,
                    }
                  : null,
                current_weather: r.weather.current_weather
                  ? {
                      temp: r.weather.current_weather.temp,
                      feels_like: r.weather.current_weather.feels_like,
                      humidity: r.weather.current_weather.humidity,
                      wind: r.weather.current_weather.wind,
                      weather: r.weather.current_weather.weather,
                    }
                  : null,
                daily: r.weather.daily?.slice(0, 5).map((d) => ({
                  ts: d.ts,
                  date_i18n: d.date_i18n,
                  temperature: d.temperature,
                  weather: d.weather,
                })),
                alerts: r.weather.alerts?.map((a) => ({
                  event: a.event,
                  description: a.description,
                  start_relative_i18n: a.start_relative_i18n,
                  tags: a.tags,
                })),
              }
            : null,
          timer: r.timer
            ? {
                duration: r.timer.duration,
                start_on_load: r.timer.start_on_load,
              }
            : null,
          unitConversion: r.unitConversion
            ? {
                amount: r.unitConversion.amount,
                from_unit: r.unitConversion.from_unit,
                to_unit: r.unitConversion.to_unit,
                dimensionality: r.unitConversion.dimensionality,
              }
            : null,
          timezones: r.timezones?.result
            ? {
                type: r.timezones.result.type,
                timezones: r.timezones.result.timezones?.map((tz) => ({
                  abbreviation: tz.abbreviation,
                  generic_name: tz.generic_name,
                  utc_offset: tz.utc_offset,
                  converted_time: tz.converted_time
                    ? {
                        strftime: tz.converted_time.strftime,
                        strfdate: tz.converted_time.strfdate,
                        strfday: tz.converted_time.strfday,
                        location: tz.converted_time.location,
                        utc_diff: tz.converted_time.utc_diff,
                        city: tz.converted_time.city,
                      }
                    : null,
                })),
              }
            : null,
          cryptocurrency: r.cryptocurrency
            ? {
                intent_type: r.cryptocurrency.intent_type,
                vs_currency: r.cryptocurrency.vs_currency,
                quote: r.cryptocurrency.quote
                  ? {
                      id: r.cryptocurrency.quote.id,
                      symbol: r.cryptocurrency.quote.symbol,
                      name: r.cryptocurrency.quote.name,
                      image: r.cryptocurrency.quote.image,
                      current_price: r.cryptocurrency.quote.current_price,
                      price_change_percentage_24h:
                        r.cryptocurrency.quote.price_change_percentage_24h,
                      market_cap: r.cryptocurrency.quote.market_cap,
                      high_24h: r.cryptocurrency.quote.high_24h,
                      low_24h: r.cryptocurrency.quote.low_24h,
                    }
                  : null,
                timeseries: r.cryptocurrency.timeseries
                  ? {
                      time_range: r.cryptocurrency.timeseries.time_range,
                      ts_price: r.cryptocurrency.timeseries.ts_price,
                    }
                  : null,
              }
            : null,
          unixtimestamp: r.unixtimestamp
            ? {
                conversion: r.unixtimestamp.conversion,
              }
            : null,
          currency: r.currency
            ? {
                amount: r.currency.amount,
                from_currency_code: r.currency.from_currency_code,
                to_currency_code: r.currency.to_currency_code,
                from_currency_name: r.currency.from_currency_name,
                to_currency_name: r.currency.to_currency_name,
                converted_amount: r.currency.converted_amount,
                exchange_rate: r.currency.exchange_rate,
              }
            : null,
          news: r.news
            ? {
                is_topical: r.news.is_topical,
                topics: r.news.topics?.slice(0, 5),
                articles: r.news.articles?.slice(0, 6).map((a) => ({
                  title: a.title,
                  url: a.url,
                  description: a.description,
                  img: a.img,
                  publish_time: a.publish_time,
                  publisher_name: a.publisher_name,
                  page_age: a.page_age,
                  meta_url: a.meta_url
                    ? {
                        hostname: a.meta_url.hostname,
                        favicon: a.meta_url.favicon,
                      }
                    : null,
                })),
              }
            : null,
          stopwatch: r.stopwatch || false,
        })),
        qanda: simplified.body.response.qanda,

        locations: simplified.body.response.locations,

        recepies:
          simplified.body.response.recipes || simplified.body.response.recepies,
        images: simplified.body.response.images,

        mixed: simplified.body.response.mixed?.main || [],
      },
    };
  } catch (e) {
    console.error("search parse error:", e);
    throw new Error(`brave parse failed (${resp.status}, ${raw.length}b)`);
  }
}
