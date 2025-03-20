from setuptools import setup, find_packages

setup(
    name="safety_metrics",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "python-dotenv==1.0.0",
        "supabase==2.0.3",
        "pandas==2.1.1",
        "numpy==1.24.3",
        "requests==2.31.0",
        "geopy==2.4.1"
    ]
) 